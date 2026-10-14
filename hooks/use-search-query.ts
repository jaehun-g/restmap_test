"use client";
import {useCallback, useEffect, useRef, useState} from "react";

export function useSearchQuery(onApplied?: () => void) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef("");
  const apply = useCallback(
    (value: string, notify = true) => {
      if (applied.current === value) return;
      applied.current = value;
      setQuery(value);
      if (notify) onApplied?.();
    },
    [onApplied],
  );
  useEffect(() => {
    timer.current = setTimeout(() => apply(input), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, apply]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    apply(input);
  }, [input, apply]);
  const clear = useCallback(
    (notify = true) => {
      if (timer.current) clearTimeout(timer.current);
      setInput("");
      apply("", notify);
    },
    [apply],
  );
  return {input, query, setInput, flush, clear};
}
