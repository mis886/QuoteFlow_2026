import React, { useState, useRef, useEffect } from 'react';
import { Lock, ChevronLeft } from 'lucide-react';
import { useAppStore, SALES_SIGNATORY_NAMES, SalesSignatoryName } from '../store';
import { sha256, hasPassword, verifyDoerPassword } from '../lib/doerAuth';

// Soft, internal-trust identity gate for sales@himalayaterpene.com — that one
// shared Google login covers two different people, so after Google auth we
// still need to ask "which of you is this" before the Authorized Signatory
// panel can resolve. Same non-goal as doerAuth.ts/PinGate.tsx: this deters
// casual misattribution on a trusted internal app, it is NOT resistant to a
// determined user with devtools. Move to a Supabase Edge Function if real
// security is ever required.
export function SalesIdentityGate() {
  const { data, updateTeamMember, resolvedSignatory, setSalesIdentity } = useAppStore();
  const isOpen = resolvedSignatory.status === 'needs-picker';

  const [picked, setPicked] = useState<SalesSignatoryName | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (picked) inputRef.current?.focus(); }, [picked]);
  // Reset back to the name-picker step each time the gate (re)opens, e.g.
  // after a sign-out + fresh sign-in re-triggers 'needs-picker'.
  useEffect(() => { if (isOpen) { setPicked(null); setPin(''); setError(''); } }, [isOpen]);

  if (!isOpen) return null;

  const roster = data.roster.filter(
    m => m.email.toLowerCase() === 'sales@himalayaterpene.com'
      && picked && m.display_name.trim().toLowerCase() === picked.toLowerCase(),
  );
  const rosterRow = roster[0];

  const fail = (msg: string) => {
    setError(msg);
    setPin('');
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const submit = async () => {
    if (!picked || !pin.trim() || submitting) return;
    if (!rosterRow) {
      fail(`No roster entry found for ${picked} under sales@ — contact MIS to set this up.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (!hasPassword(rosterRow)) {
        // First-time enrollment: whatever PIN is entered now becomes this
        // person's PIN going forward, stored hashed — never plaintext.
        const password_hash = await sha256(pin.trim());
        await updateTeamMember(rosterRow.email, rosterRow.role, rosterRow.display_name, { password_hash });
        setSalesIdentity(picked);
      } else if (await verifyDoerPassword(rosterRow, pin.trim())) {
        setSalesIdentity(picked);
      } else {
        fail('Incorrect PIN — try again.');
      }
    } catch {
      fail('Could not verify PIN — try again.');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center animate-in fade-in duration-200">
      <div className={`w-[320px] bg-white border border-g200 rounded-[6px] shadow-lg p-8 flex flex-col items-center gap-5 ${shake ? 'animate-shake-x' : ''}`}>
        <div className="w-12 h-12 rounded-full bg-g100 flex items-center justify-center">
          <Lock size={20} className="text-g500" />
        </div>

        {!picked ? (
          <>
            <div className="text-center">
              <div className="font-serif text-[17px] text-blk tracking-tight">Who are you?</div>
              <div className="text-[11.5px] text-g400 mt-1">Pick your name to continue as sales@</div>
            </div>
            <div className="w-full flex flex-col gap-2">
              {SALES_SIGNATORY_NAMES.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPicked(name)}
                  className="w-full h-10 border border-g300 rounded-[3px] text-[13px] font-medium text-blk hover:border-red-mrt hover:bg-red-lt transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="font-serif text-[17px] text-blk tracking-tight">{picked}</div>
              <div className="text-[11.5px] text-g400 mt-1">
                {rosterRow && !hasPassword(rosterRow) ? 'Set a PIN for your account' : 'Enter your PIN to continue'}
              </div>
            </div>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              maxLength={6}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="PIN"
              className="w-full text-center font-mono text-[18px] tracking-[6px] border border-g300 rounded-[3px] px-4 py-3 outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
            />
            {error && <p className="text-[11.5px] text-red-mrt font-medium -mt-2 text-center">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={submitting || pin.trim().length < 4}
              className="w-full h-10 bg-blk text-white text-[13px] font-semibold rounded-[3px] hover:bg-g700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Verifying…' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => { setPicked(null); setPin(''); setError(''); }}
              className="inline-flex items-center gap-1 text-[11px] text-g400 hover:text-g600 transition-colors"
            >
              <ChevronLeft size={12} /> Not {picked}?
            </button>
          </>
        )}
      </div>
    </div>
  );
}
