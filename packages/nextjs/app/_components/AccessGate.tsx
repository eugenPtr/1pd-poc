"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type AccessGateProps = {
  requiredCode?: string;
  enabled?: boolean;
  children: ReactNode;
};

const STORAGE_KEY = "access-code";

export function AccessGate({ requiredCode, enabled = false, children }: AccessGateProps) {
  const normalizedCode = useMemo(() => (requiredCode ? requiredCode.trim() : ""), [requiredCode]);

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(() => {
    if (!enabled || !normalizedCode) return true;
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === normalizedCode;
  });

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if ((!enabled || !normalizedCode) && typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [enabled, normalizedCode]);

  useEffect(() => {
    if (!enabled || !normalizedCode) {
      setIsAuthorized(true);
      return;
    }

    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setIsAuthorized(stored === normalizedCode);
  }, [enabled, normalizedCode]);

  // Don't render anything until hydrated to prevent flash
  if (!isHydrated) {
    return null;
  }

  if (!enabled || !normalizedCode || isAuthorized) {
    return <>{children}</>;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const entered = input.trim();

    if (entered === normalizedCode) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, normalizedCode);
      }
      setIsAuthorized(true);
      setError("");
    } else {
      setError("Incorrect access code.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl border border-base-300 bg-base-100 p-6 shadow-md"
      >
        <h1 className="text-xl font-semibold mb-4 text-center">Enter Access Code</h1>
        <label className="form-control w-full">
          <input
            type="text"
            value={input}
            onChange={event => {
              setInput(event.target.value);
              if (error) {
                setError("");
              }
            }}
            className="input input-bordered w-full"
            autoFocus
            autoComplete="off"
            placeholder="Enter code"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-error text-center">{error}</p> : null}
        <button type="submit" className="btn btn-primary mt-6 w-full">
          Continue
        </button>
      </form>
    </div>
  );
}
