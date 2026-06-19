"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@liveboard/ui/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = {
  /** 省略時はグループラベルを描画しない（先頭の主要ナビ等で利用）。 */
  label?: string;
  items: {
    title: string;
    url: string;
    icon?: React.ReactNode;
  }[];
};

function useActiveUrl(sections: NavSection[]) {
  const pathname = usePathname();
  const allUrls = sections.flatMap((s) => s.items.map((i) => i.url));
  // Find the longest URL that matches the current pathname
  let bestMatch = "";
  for (const url of allUrls) {
    const matches =
      url === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === url || pathname.startsWith(`${url}/`);
    if (matches && url.length > bestMatch.length) {
      bestMatch = url;
    }
  }
  return bestMatch;
}

export function NavMain({ sections }: { sections: NavSection[] }) {
  const activeUrl = useActiveUrl(sections);

  return (
    <>
      {sections.map((section, sectionIndex) => (
        <SidebarGroup key={section.label ?? `__section-${sectionIndex}`}>
          {section.label && (
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          )}
          <SidebarMenu>
            {section.items.map((item) => {
              const isActive = item.url === activeUrl;
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive}
                    render={<Link href={item.url as "/dashboard"} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
