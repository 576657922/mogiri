import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { SettingsView } from '../features/account/SettingsView';
import { ScanConfirmView } from '../features/scan/ScanConfirmView';
import { ScanFlowView } from '../features/scan/ScanFlowView';
import { FootprintMapView } from '../features/share/FootprintMapView';
import { RecapView } from '../features/share/RecapView';
import { TicketDetailView } from '../features/ticket/TicketDetailView';
import { TicketFormView } from '../features/ticket/TicketFormView';
import { TimelineView } from '../features/timeline/TimelineView';
import { AppShell } from '../ui';

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TimelineView,
});

const scanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scan',
  component: ScanFlowView,
});

const scanConfirmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scan/confirm',
  component: ScanConfirmView,
});

const newTicketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/new/edit',
  component: () => <TicketFormView />,
});

const ticketDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$id',
  component: function TicketDetailRouteComponent() {
    const { id } = ticketDetailRoute.useParams();
    return <TicketDetailView id={id} />;
  },
});

const ticketEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$id/edit',
  component: function TicketEditRouteComponent() {
    const { id } = ticketEditRoute.useParams();
    return <TicketFormView ticketId={id} />;
  },
});

const recapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recap/$year',
  component: function RecapRouteComponent() {
    const { year } = recapRoute.useParams();
    return <RecapView yearParam={year} />;
  },
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map',
  component: FootprintMapView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  scanRoute,
  scanConfirmRoute,
  newTicketRoute,
  ticketDetailRoute,
  ticketEditRoute,
  recapRoute,
  mapRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
