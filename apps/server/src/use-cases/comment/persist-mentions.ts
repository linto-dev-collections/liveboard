import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";
import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";

type Repos = {
  commentRepo: ReturnType<typeof createCommentRepository>;
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/**
 * メンションと通知を**原子的 INSERT**で永続化し（テナント境界 §8.2）、オンライン即時通知の
 * 対象 userId（actor 自身を除外・重複排除済み）を返す。
 *
 * - メンション/通知とも `WHERE EXISTS (... JOIN member)` で org メンバーのみに限定され、
 *   org 外ユーザーは 0 行で無視される（DB で担保）。
 * - 通知 id は use-case 側で採番（被通知ごとに一意・dedup UNIQUE が再試行重複を排除）。
 */
export async function persistMentions(
  repos: Repos,
  params: {
    boardId: string;
    commentId: string;
    actorUserId: string;
    mentionedUserIds: string[];
    now: number;
  },
): Promise<string[]> {
  const unique = [...new Set(params.mentionedUserIds)].filter(
    (id) => id.length > 0,
  );
  if (unique.length === 0) return [];

  await repos.commentRepo.addMentionsAtomic({
    commentId: params.commentId,
    userIds: unique,
    now: params.now,
  });

  // 自分自身へのメンション通知は作らない（mention 行は残してよいが通知はノイズ）。
  const recipients = unique.filter((uid) => uid !== params.actorUserId);
  if (recipients.length > 0) {
    await repos.notificationRepo.createMentionNotificationsAtomic({
      boardId: params.boardId,
      commentId: params.commentId,
      actorUserId: params.actorUserId,
      recipients: recipients.map((uid) => ({
        id: crypto.randomUUID(),
        userId: uid,
      })),
      now: params.now,
    });
  }
  return recipients;
}
