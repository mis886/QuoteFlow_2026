import React, { useState, useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';

// Soft client-side PIN gate, shared by the Customer Intel board and the
// PIN-protected Settings tabs. Verifies against a plaintext PIN from settings —
// a deterrent for casual misuse on a trusted internal app, not real security.
export function PinGate({ correctPin, onUnlock, title = 'Protected', subtitle = 'Enter your PIN to continue' }: {
  correctPin: string;
  onUnlock: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (input === correctPin) { onUnlock(); }
    else { setError('Incorrect PIN — try again.'); setInput(''); setTimeout(() => setError(''), 2000); }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-cream py-16">
      <div className="w-[320px] bg-white border border-g200 rounded-[6px] shadow-lg p-8 flex flex-col items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-g100 flex items-center justify-center">
          <Lock size={20} className="text-g500" />
        </div>
        <div className="text-center">
          <div className="font-serif text-[17px] text-blk tracking-tight">{title}</div>
          <div className="text-[11.5px] text-g400 mt-1">{subtitle}</div>
        </div>
        <input
          ref={inputRef}
          type="password"
          value={input}
          maxLength={12}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="PIN"
          className="w-full text-center font-mono text-[18px] tracking-[6px] border border-g300 rounded-[3px] px-4 py-3 outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
        />
        {error && <p className="text-[11.5px] text-red-mrt font-medium -mt-2">{error}</p>}
        <button
          type="button"
          onClick={submit}
          className="w-full h-10 bg-blk text-white text-[13px] font-semibold rounded-[3px] hover:bg-g700 transition-colors"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
