import Image from 'next/image'

export default function BrandIdentity() {
  return (
    <>
      <div className="brand-mark">
        <Image src="/images/local-paint-pilot.png" alt="Local Paint Pilot Logo" />
      </div>
      <div className="brand-copy">
        <span className="brand-title">Local Paint Pilot</span>
        <span className="brand-subtitle">Boosting your Google Profile</span>
      </div>
    </>
  );
}
