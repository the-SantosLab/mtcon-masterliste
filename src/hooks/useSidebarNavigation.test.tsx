import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSidebarNavigation } from './useSidebarNavigation';

describe('sidebar navigation continuity', () => {
  it('restores scroll and expanded subnavigation after a page remount', () => {
    const first = renderHook(() => useSidebarNavigation('scroll-test', 'crm', false));
    const nav = document.createElement('nav');
    Object.assign(first.result.current.navRef, { current: nav });
    act(() => first.result.current.setOpenNavItem('/crm/contacts'));
    nav.scrollTop = 240;
    act(() => first.result.current.onScroll());
    first.unmount();
    const second = renderHook(() => useSidebarNavigation('scroll-test', 'crm', false));
    const restored = document.createElement('nav');
    Object.assign(second.result.current.navRef, { current: restored });
    second.rerender();
    expect(restored.scrollTop).toBe(240);
    expect(second.result.current.openNavItem).toBe('/crm/contacts');
    expect(second.result.current.openGroup).toBe('crm');
  });

  it('does not collapse manually expanded navigation within the same process group', () => {
    const hook = renderHook(({ secondary }) => useSidebarNavigation('group-test', 'crm', secondary), { initialProps: { secondary: false } });
    act(() => hook.result.current.setMoreAdminOpen(true));
    hook.rerender({ secondary: true });
    hook.rerender({ secondary: false });
    expect(hook.result.current.moreAdminOpen).toBe(true);
  });
});