import './globals.css';
import { Fraunces, DM_Sans } from 'next/font/google';
import Floaters from '@/components/Floaters';
const display = Fraunces({ subsets: ['latin'], variable: '--font-display' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body' });
export const metadata = {
  title: 'SyncCinema', description: 'Watch together, wherever you are.',
  robots: { index: false, follow: false, nocache: true },       // private: keep out of search engines
};
export const viewport = { themeColor: '#d9467a' };
const themeInit = `try{var t=localStorage.theme;if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <div aria-hidden className="ambient">
          <div className="aurora"><i /><i /><i /></div>
          <div className="pointer-events-none fixed inset-0 z-0"><Floaters n={10} /></div>
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
