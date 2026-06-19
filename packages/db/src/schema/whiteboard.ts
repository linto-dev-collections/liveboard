import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { member, organization, user } from "./auth";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull();

// --- board ---
export const board = sqliteTable(
  "board",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    title: text("title").default("Untitled").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    thumbnailKey: text("thumbnail_key"),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    deletionState: text("deletion_state", { enum: ["active", "purging"] })
      .default("active")
      .notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("board_org_title_idx").on(
      t.organizationId,
      sql`${t.title} COLLATE NOCASE`,
    ),
    index("board_org_activity_idx").on(t.organizationId, t.lastActivityAt),
    // board_role/board_favorite の複合 FK ターゲット（org 整合の DB 強制, I2）
    uniqueIndex("board_id_org_uidx").on(t.id, t.organizationId),
    check(
      "board_deletion_state_check",
      sql`${t.deletionState} IN ('active','purging')`,
    ),
  ],
);

// --- board_role ---
export const boardRole = sqliteTable(
  "board_role",
  {
    // board/user/org はいずれも複合 FK で参照（単一 board FK は持たない, I2/H5）
    boardId: text("board_id").notNull(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    index("board_role_userId_idx").on(t.userId),
    // 退会で board_role も CASCADE（H5）。member の UNIQUE(org,user)＝G4 が前提
    foreignKey({
      name: "board_role_member_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
    // org 整合の DB 強制（I2）: organization_id = board.org を保証
    foreignKey({
      name: "board_role_board_fk",
      columns: [t.boardId, t.organizationId],
      foreignColumns: [board.id, board.organizationId],
    }).onDelete("cascade"),
    check(
      "board_role_role_check",
      sql`${t.role} IN ('owner','editor','viewer')`,
    ),
  ],
);

// --- board_favorite ---
export const boardFavorite = sqliteTable(
  "board_favorite",
  {
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(), // member/board 複合 FK 用（H5/I2）
    boardId: text("board_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.boardId] }),
    index("board_favorite_boardId_idx").on(t.boardId),
    // 退会で favorite も CASCADE（H5）
    foreignKey({
      name: "board_favorite_member_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
    // org 整合の DB 強制（I2）
    foreignKey({
      name: "board_favorite_board_fk",
      columns: [t.boardId, t.organizationId],
      foreignColumns: [board.id, board.organizationId],
    }).onDelete("cascade"),
  ],
);

// --- comment_thread ---
export const commentThread = sqliteTable(
  "comment_thread",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    anchorKind: text("anchor_kind", { enum: ["element", "point"] }).notNull(),
    anchorElementId: text("anchor_element_id"),
    anchorX: real("anchor_x"),
    anchorY: real("anchor_y"),
    resolved: integer("resolved", { mode: "boolean" }).default(false).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("comment_thread_board_resolved_idx").on(t.boardId, t.resolved),
    check("comment_thread_resolved_check", sql`${t.resolved} IN (0,1)`),
    check(
      "comment_thread_anchor_check",
      sql`(
        (${t.anchorKind} = 'element' AND ${t.anchorElementId} IS NOT NULL AND ${t.anchorX} IS NULL AND ${t.anchorY} IS NULL)
        OR
        (${t.anchorKind} = 'point' AND ${t.anchorX} IS NOT NULL AND ${t.anchorY} IS NOT NULL AND ${t.anchorElementId} IS NULL)
      )`,
    ),
  ],
);

// --- comment ---
export const comment = sqliteTable(
  "comment",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => commentThread.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comment_thread_created_idx").on(t.threadId, t.createdAt)],
);

// --- comment_mention ---
export const commentMention = sqliteTable(
  "comment_mention",
  {
    commentId: text("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    mentionedUserId: text("mentioned_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.mentionedUserId] }),
    index("comment_mention_user_idx").on(t.mentionedUserId),
  ],
);

// --- notification（F4/F5）---
export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["mention"] }).notNull(),
    // F5: NOT NULL（NULL だと dedup UNIQUE が機能しない）
    commentId: text("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notification_dedup_uidx").on(t.type, t.userId, t.commentId),
    index("notification_user_org_created_idx").on(
      t.userId,
      t.organizationId,
      t.createdAt,
    ),
    index("notification_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
    check("notification_type_check", sql`${t.type} IN ('mention')`),
  ],
);

// --- board_r2_object（R2 統一マニフェスト・F4a/F9）---
export const boardR2Object = sqliteTable(
  "board_r2_object",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["asset", "thumbnail", "backup", "history", "export"],
    }).notNull(),
    r2Key: text("r2_key").notNull(),
    status: text("status", {
      enum: ["pending", "sanitizing", "ready", "deleting", "failed"],
    })
      .default("pending")
      .notNull(),
    size: integer("size"),
    gcCandidateAt: integer("gc_candidate_at", { mode: "timestamp_ms" }), // 二段階 GC（I4）
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("board_r2_object_r2Key_uidx").on(t.r2Key),
    // 同一ボード複合 FK のターゲット（G2）。board_id 単独索引は前方被覆のため持たない
    uniqueIndex("board_r2_object_board_id_uidx").on(t.boardId, t.id),
    index("board_r2_object_board_status_idx").on(t.boardId, t.status),
    check(
      "board_r2_object_kind_check",
      sql`${t.kind} IN ('asset','thumbnail','backup','history','export')`,
    ),
    check(
      "board_r2_object_status_check",
      sql`${t.status} IN ('pending','sanitizing','ready','deleting','failed')`,
    ),
    check(
      "board_r2_object_size_check",
      sql`${t.size} IS NULL OR ${t.size} > 0`,
    ),
    // ready は size 必須（I7・N4 容量監査）
    check(
      "board_r2_object_ready_size_check",
      sql`${t.status} != 'ready' OR ${t.size} IS NOT NULL`,
    ),
  ],
);

// --- asset（画像メタ・manifest 参照）---
export const asset = sqliteTable(
  "asset",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull(),
    // 同一ボード保証のため単一 FK ではなく複合 FK（下の foreignKey）で参照（G2）
    r2ObjectId: text("r2_object_id").notNull(),
    mime: text("mime", {
      enum: [
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "image/gif",
        "image/webp",
      ],
    }).notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastRetrievedAt: integer("last_retrieved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.fileId] }),
    uniqueIndex("asset_r2Object_uidx").on(t.r2ObjectId),
    // 同一ボードの R2 オブジェクトのみ参照可（別ボード参照を DB で禁止, G2）
    foreignKey({
      name: "asset_board_r2_object_fk",
      columns: [t.boardId, t.r2ObjectId],
      foreignColumns: [boardR2Object.boardId, boardR2Object.id],
    }).onDelete("cascade"),
    check(
      "asset_mime_check",
      sql`${t.mime} IN ('image/png','image/jpeg','image/svg+xml','image/gif','image/webp')`,
    ),
    check(
      "asset_dim_check",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`,
    ),
  ],
);

// --- deletion_job（F4b）---
export const deletionJob = sqliteTable(
  "deletion_job",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id").notNull(), // 対象は最終的に消えるため FK 無し
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    state: text("state", {
      enum: [
        "queued",
        "purging_do",
        "purging_r2",
        "ready_to_delete",
        "done",
        "failed",
      ],
    })
      .default("queued")
      .notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    leaseVersion: integer("lease_version").default(0).notNull(), // フェンシングトークン（H4）
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: integer("next_retry_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deletion_job_board_uidx").on(t.boardId),
    index("deletion_job_due_idx").on(t.state, t.nextRetryAt),
    check(
      "deletion_job_state_check",
      sql`${t.state} IN ('queued','purging_do','purging_r2','ready_to_delete','done','failed')`,
    ),
    // lease 列の半端状態（恒久ロック）を防止（G3）
    check(
      "deletion_job_lease_check",
      sql`(${t.leaseOwner} IS NULL AND ${t.leaseExpiresAt} IS NULL)
        OR (${t.leaseOwner} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL)`,
    ),
  ],
);

// --- audit_log（F6: org SET NULL / G7: org スナップショット）---
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    // org 削除で NULL になる（参照用）
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    // org 削除後も帰属を追跡する不変スナップショット（FK 無し・作成時固定, G7）
    organizationIdSnapshot: text("organization_id_snapshot").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: text("metadata"),
    createdAt: createdAt(),
  },
  (t) => [
    // org 削除後も有効な不変スナップショットで索引
    index("audit_log_org_created_idx").on(
      t.organizationIdSnapshot,
      t.createdAt,
    ),
    index("audit_log_target_idx").on(t.targetType, t.targetId),
  ],
);

// --- relations ---
export const boardRelations = relations(board, ({ one, many }) => ({
  organization: one(organization, {
    fields: [board.organizationId],
    references: [organization.id],
  }),
  createdBy: one(user, {
    fields: [board.createdByUserId],
    references: [user.id],
  }),
  roles: many(boardRole),
  favorites: many(boardFavorite),
  threads: many(commentThread),
  r2Objects: many(boardR2Object),
  assets: many(asset),
}));

export const commentThreadRelations = relations(
  commentThread,
  ({ one, many }) => ({
    board: one(board, {
      fields: [commentThread.boardId],
      references: [board.id],
    }),
    createdBy: one(user, {
      fields: [commentThread.createdByUserId],
      references: [user.id],
    }),
    comments: many(comment),
  }),
);

export const commentRelations = relations(comment, ({ one, many }) => ({
  thread: one(commentThread, {
    fields: [comment.threadId],
    references: [commentThread.id],
  }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
  mentions: many(commentMention),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [notification.organizationId],
    references: [organization.id],
  }),
  comment: one(comment, {
    fields: [notification.commentId],
    references: [comment.id],
  }),
}));

export const boardR2ObjectRelations = relations(boardR2Object, ({ one }) => ({
  board: one(board, {
    fields: [boardR2Object.boardId],
    references: [board.id],
  }),
}));

export const assetRelations = relations(asset, ({ one }) => ({
  board: one(board, { fields: [asset.boardId], references: [board.id] }),
  r2Object: one(boardR2Object, {
    fields: [asset.r2ObjectId],
    references: [boardR2Object.id],
  }),
}));
