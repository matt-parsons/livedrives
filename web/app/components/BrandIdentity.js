import Image from 'next/image'

export default function BrandIdentity() {
  return (
    <>
      <div className="brand-mark">
        <Image src="/images/local-paint-pilot.png" width={44} height={44} alt="Local Paint Pilot Logo" />
      </div>
      <div className="brand-copy">
        <span className="brand-title">Local Paint Pilot</span>
      </div>
    </>
  );
}
