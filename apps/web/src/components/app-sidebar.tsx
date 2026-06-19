"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@liveboard/ui/components/ui/sidebar";
import {
  Building2Icon,
  LayoutDashboardIcon,
  PresentationIcon,
  UsersIcon,
} from "lucide-react";
import { NavMain, type NavSection } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { NotificationBell } from "@/components/notification-bell";
import { TeamSwitcher } from "@/components/team-switcher";

const navSections: NavSection[] = [
  {
    items: [
      {
        title: "ダッシュボード",
        url: "/dashboard",
        icon: <LayoutDashboardIcon />,
      },
      {
        title: "ボード",
        url: "/dashboard/boards",
        icon: <PresentationIcon />,
      },
    ],
  },
  {
    label: "設定",
    items: [
      {
        title: "組織",
        url: "/dashboard/settings/organization",
        icon: <Building2Icon />,
      },
      {
        title: "メンバー",
        url: "/dashboard/settings/members",
        icon: <UsersIcon />,
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={navSections} />
      </SidebarContent>
      <SidebarFooter>
        <NotificationBell />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
