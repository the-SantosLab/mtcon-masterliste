import { useLayoutEffect, useRef, useState } from 'react';

interface SidebarState {
  routeGroup: string;
  openGroup: string | null;
  openNavItem: string | null;
  moreAdminOpen: boolean;
  scrollTop: number;
}

// Presentation state only; never used for access decisions.
const navigationByUser = new Map<string, SidebarState>();

export function useSidebarNavigation(userId: string | undefined, routeGroup: string, activeSecondary: boolean) {
  const key = userId ?? 'signed-out';
  const cached = navigationByUser.get(key);
  const [openGroup, setOpenGroup] = useState<string | null>(cached?.routeGroup === routeGroup ? cached.openGroup : routeGroup);
  const [openNavItem, setOpenNavItem] = useState<string | null>(cached?.openNavItem ?? null);
  const [moreAdminOpen, setMoreAdminOpen] = useState(cached?.routeGroup === routeGroup ? cached.moreAdminOpen : activeSecondary);
  const navRef = useRef<HTMLElement>(null);
  const previousGroup = useRef(routeGroup);
  const scrollTop = useRef(cached?.scrollTop ?? 0);

  useLayoutEffect(() => {
    if (previousGroup.current !== routeGroup) {
      previousGroup.current = routeGroup;
      setOpenGroup(routeGroup);
      setMoreAdminOpen(activeSecondary);
    }
  }, [routeGroup, activeSecondary]);

  useLayoutEffect(() => {
    navigationByUser.set(key, { routeGroup, openGroup, openNavItem, moreAdminOpen, scrollTop: scrollTop.current });
    if (navRef.current) navRef.current.scrollTop = scrollTop.current;
  });

  const onScroll = () => {
    if (!navRef.current) return;
    scrollTop.current = navRef.current.scrollTop;
    navigationByUser.set(key, { routeGroup, openGroup, openNavItem, moreAdminOpen, scrollTop: scrollTop.current });
  };

  return { navRef, onScroll, openGroup, setOpenGroup, openNavItem, setOpenNavItem, moreAdminOpen, setMoreAdminOpen };
}