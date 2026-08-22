import { useState } from 'react';
import { useAppStore } from '../store';
import { TourOverlay, TOUR_STEPS } from './TourOverlay';

const TOUR_KEY = 'enqboss_tour_done';

export function AppTour() {
  const { user } = useAppStore();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(() => !localStorage.getItem(TOUR_KEY));

  if (!user || !active) return null;

  const done = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setActive(false);
  };

  return (
    <TourOverlay
      step={step}
      onNext={() => {
        if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
        else done();
      }}
      onSkip={done}
    />
  );
}