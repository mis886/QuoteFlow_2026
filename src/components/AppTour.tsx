import { useState } from 'react';
import { useAppStore } from '../store';
import { TourOverlay, TOUR_STEPS } from './TourOverlay';

const TOUR_KEY = 'enqboss_tour_done';

export function AppTour() {
  const { user, canSeeEnqQuote } = useAppStore();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(() => !localStorage.getItem(TOUR_KEY));

  if (!user || !active) return null;

  const steps = TOUR_STEPS.filter(s => canSeeEnqQuote || (s.id !== 'enquiries' && s.id !== 'quotations'));

  const done = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setActive(false);
  };

  return (
    <TourOverlay
      steps={steps}
      step={step}
      onNext={() => {
        if (step < steps.length - 1) setStep(s => s + 1);
        else done();
      }}
      onSkip={done}
    />
  );
}