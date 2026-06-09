import React, { useEffect } from 'react';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import StatsBar from '../components/landing/StatsBar';
import HowItWorks from '../components/landing/HowItWorks';
import FeaturesSection from '../components/landing/FeaturesSection';
import FAQSection from '../components/landing/FAQSection';
import PricingSection from '../components/landing/PricingSection';
import FinalCTA from '../components/landing/FinalCTA';
import Footer from '../components/landing/Footer';
import { C, FONT_BODY } from '../components/landing/landingUtils';

// ── Google Fonts Loader ────────────────────────────────────────
function GoogleFonts() {
  useEffect(() => {
    const id = 'legisvox-lp-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Lato:wght@300;400;700&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}

// ── Main Export ────────────────────────────────────────────────
export default function LandingPage({ session }) {
  // Override body background for this page only
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = C.bg;
    document.documentElement.classList.remove('dark', 'light', 'theme-blue', 'theme-emerald', 'theme-sepia');
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <>
      <GoogleFonts />
      <div style={{ fontFamily: FONT_BODY, color: C.text, background: C.bg }}>
        <Navbar session={session} />
        <main>
          <HeroSection session={session} />
          <StatsBar />
          <HowItWorks />
          <FeaturesSection />
          <FAQSection />
          <PricingSection />
          <FinalCTA session={session} />
        </main>
        <Footer />
      </div>
    </>
  );
}
