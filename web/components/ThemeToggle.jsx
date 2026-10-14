'use client';
import { Moon, Sun } from 'lucide-react';
export default function ThemeToggle() {
  const flip = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.theme = dark ? 'dark' : 'light';
  };
  return (
    <button onClick={flip} aria-label="Toggle light or dark mode" className="ghost !p-2">
      <Sun className="hidden h-4 w-4 dark:block" /><Moon className="h-4 w-4 dark:hidden" />
    </button>
  );
}
