import {
  LayoutDashboard,
  Monitor,
  Ticket,
  PackageCheck,
  BookOpen,
  BarChart3,
  Settings,
  Headphones,
  LogOut,
  Laptop,
  Play,
  Activity,
  ScrollText,
  UserCog,
  FolderArchive,
  Mail,
  Shield,
  Flame,
  Users,
  Key,
  Building2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Dispositivos", url: "/dispositivos", icon: Laptop },
  { title: "Inventario", url: "/inventario", icon: Monitor },
  { title: "Tickets", url: "/tickets", icon: Ticket },
  { title: "Automatización", url: "/automatizacion", icon: Play },
  { title: "Diagnósticos", url: "/diagnosticos", icon: Activity },
  { title: "Perfiles de Rol", url: "/perfiles", icon: UserCog },
  { title: "Backups", url: "/backups", icon: FolderArchive },
  { title: "Email", url: "/email", icon: Mail },
  { title: "VPN", url: "/vpn", icon: Shield },
  { title: "Firewall", url: "/firewall", icon: Flame },
  { title: "Entregas", url: "/entregas", icon: PackageCheck },
  { title: "Licencias", url: "/licencias", icon: Key },
  { title: "Base de Conocimiento", url: "/conocimiento", icon: BookOpen },
  { title: "Logs", url: "/logs", icon: ScrollText },
  { title: "Roles", url: "/roles", icon: Users },
  { title: "Reportes", url: "/reportes", icon: BarChart3 },
  { title: "Corporativo", url: "/corporativo", icon: Building2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Headphones className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-sidebar-primary-foreground">
                IT Service Desk
              </h2>
              <p className="text-xs text-sidebar-muted">Service Delivery</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest">
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
              <Settings className="h-4 w-4 text-sidebar-muted" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.user_metadata?.full_name || 'Usuario'}</p>
                <p className="text-[10px] text-sidebar-muted truncate">{user?.email}</p>
              </div>
            )}
          </div>
          <button onClick={signOut} className="p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
