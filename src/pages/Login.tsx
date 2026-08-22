import React from 'react';
import { useAppStore } from '../store';
import { signInWithGoogle } from '../lib/supabase';
import { Button } from '../components/ui';
import { Lock, LogIn } from 'lucide-react';

export function Login() {
  const { authError } = useAppStore();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  const handleLogin = async () => {
    setErrorMsg(null);
    setIsLoggingIn(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        if (error.message.includes('not enabled')) {
          setErrorMsg('Google login is not yet enabled in your Supabase Dashboard.');
        } else {
          setErrorMsg('Login failed: ' + error.message);
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const displayError = authError || errorMsg;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-g200 rounded-[8px] p-8 shadow-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-red-lt rounded-full flex items-center justify-center text-red-mrt mb-4">
            <Lock size={32} />
          </div>
          <div className="font-mono text-[10px] font-bold tracking-[4px] uppercase text-red-mrt mb-2">Himalaya Terpenes</div>
          <h1 className="font-serif text-3xl text-blk tracking-tight leading-tight">EQ System Access</h1>
          <p className="text-g500 text-sm mt-3 font-light">
            Authorized personnel only. Please sign in with your <br/> 
            <strong className="text-blk font-medium">@himalayaterpene.com</strong> email account.
          </p>
          {displayError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded text-red-mrt text-xs font-medium animate-in fade-in slide-in-from-top-1">
              {displayError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Button 
            variant="dark" 
            className="w-full h-12 flex items-center justify-center gap-3 text-base shadow-sm"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Redirecting...' : (
              <>
                <LogIn size={20} />
                Sign in with Google
              </>
            )}
          </Button>
          
          <div className="pt-4 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[1px] text-g400">
              Encryption Enabled • Secure Sync
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
