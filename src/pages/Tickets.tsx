import React from 'react';
import { useAppStore } from '../store';
import { TicketRaise } from './TicketRaise';
import { TicketResolver } from './TicketResolver';

// Same /tickets route/nav slot for everyone — which view renders depends on
// the logged-in user's email (isAdmin, resolved from ADMIN_EMAILS in
// src/store/index.tsx), not the self-picked "doer" identity used for KPI
// attribution elsewhere.
export function Tickets() {
  const { isAdmin } = useAppStore();
  return isAdmin ? <TicketResolver /> : <TicketRaise />;
}
