export const CENTER_NAVIGATION_EVENT = 'hedge-station:center:navigate';
export const CENTER_ROUTE_CHANGED_EVENT = 'hedge-station:center:route-changed';

export type CenterNavigationDetail = {
  path: string;
};

export type CenterRouteChangedDetail = {
  path: string;
};

export function navigateCenterPanel(path: string): void {
  window.dispatchEvent(
    new CustomEvent<CenterNavigationDetail>(CENTER_NAVIGATION_EVENT, {
      detail: { path }
    })
  );
}

export function publishCenterRouteChanged(path: string): void {
  window.dispatchEvent(
    new CustomEvent<CenterRouteChangedDetail>(CENTER_ROUTE_CHANGED_EVENT, {
      detail: { path }
    })
  );
}
