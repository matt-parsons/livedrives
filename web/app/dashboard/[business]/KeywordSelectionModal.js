'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import KeywordOriginZoneForm from '../get-started/KeywordOriginZoneForm';

export default function KeywordSelectionModal({ hasSelectedKeyword, business, primaryOriginZone }) {
  return (
    <>
      {!hasSelectedKeyword ? (
        <Dialog open={!hasSelectedKeyword} onOpenChange={() => {}}>
          <DialogContent hideCloseButton={true} className="max-w-3xl">
            <section>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">STEP 1</p>
                  <p className="text-lg font-semibold text-foreground">Select your best keyword</p>
                  <p className="text-sm text-muted-foreground">
                    This should be the main search term you believe customers use to find your business. <br />It&apos;s almost always a variation of <strong>[your primary service] + [your main location]</strong>.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <KeywordOriginZoneForm
                  businessId={business.id}
                  businessName={business.businessName}
                  destinationAddress={business.destinationAddress}
                  destinationZip={business.destinationZip}
                  destLat={business.destLat}
                  destLng={business.destLng}
                  existingZone={primaryOriginZone}
                />
              </div>
            </section>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}