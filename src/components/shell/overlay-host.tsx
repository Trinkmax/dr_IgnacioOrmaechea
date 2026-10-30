"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { AnimatePresence, motion } from "motion/react";
import { useIsDesktop } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useOverlay, type OverlayEntry, type OverlaySpec } from "@/components/shell/overlay-store";
import { AppointmentFormSheet } from "@/components/forms/appointment-form";
import { AppointmentSheet } from "@/components/forms/appointment-sheet";
import { PatientFormSheet, PatientSheet } from "@/components/forms/patient-forms";
import { PaymentFormSheet } from "@/components/forms/payment-form";
import { ExpenseFormSheet, RecurringFormSheet } from "@/components/forms/expense-forms";
import { SupplierFormSheet, SupplierSheet } from "@/components/forms/supplier-forms";
import { TreatmentFormSheet } from "@/components/forms/treatment-form";
import { WaitlistFormSheet, WaitlistSheet } from "@/components/forms/waitlist-forms";
import { MemberFormSheet } from "@/components/forms/member-form";

function renderSpec(spec: OverlaySpec) {
  switch (spec.type) {
    case "appointment":
      return <AppointmentSheet id={spec.id} />;
    case "appointment-form":
      return <AppointmentFormSheet appointmentId={spec.appointmentId} defaults={spec.defaults} />;
    case "patient":
      return <PatientSheet id={spec.id} />;
    case "patient-form":
      return <PatientFormSheet patientId={spec.patientId} initialName={spec.initialName} onSaved={spec.onSaved} />;
    case "payment-form":
      return <PaymentFormSheet paymentId={spec.paymentId} patientId={spec.patientId} appointmentId={spec.appointmentId} />;
    case "expense-form":
      return <ExpenseFormSheet expenseId={spec.expenseId} defaults={spec.defaults} />;
    case "recurring-form":
      return <RecurringFormSheet recurringId={spec.recurringId} />;
    case "supplier":
      return <SupplierSheet id={spec.id} />;
    case "supplier-form":
      return <SupplierFormSheet supplierId={spec.supplierId} />;
    case "treatment-form":
      return <TreatmentFormSheet treatmentId={spec.treatmentId} />;
    case "waitlist-form":
      return <WaitlistFormSheet patientId={spec.patientId} />;
    case "waitlist":
      return <WaitlistSheet />;
    case "member-form":
      return <MemberFormSheet userId={spec.userId} />;
  }
}

/** Una sola hoja para toda la app: lateral en desktop, desde abajo en mobile. */
export function OverlayHost() {
  const { stack, close } = useOverlay();
  const isDesktop = useIsDesktop();
  const top = stack.at(-1) ?? null;

  // Mantener el último contenido visible durante la animación de cierre.
  const [lastTop, setLastTop] = useState<OverlayEntry | null>(top);
  if (top && top !== lastTop) setLastTop(top);
  const shown = top ?? lastTop;
  const depth = stack.length;

  return (
    <Drawer.Root
      open={Boolean(top)}
      onOpenChange={(open) => !open && close()}
      direction={isDesktop ? "right" : "bottom"}
      onAnimationEnd={(open) => !open && setLastTop(null)}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[#1e1916]/30 backdrop-blur-[1.5px]" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface outline-none",
            isDesktop
              ? "inset-y-0 right-0 w-[min(480px,100vw)] border-l border-line shadow-pop"
              : "inset-x-0 bottom-0 max-h-[94dvh] rounded-t-[24px] shadow-pop",
          )}
        >
          {!isDesktop ? <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden /> : null}
          <AnimatePresence mode="popLayout" initial={false}>
            {shown ? (
              <motion.div
                key={shown.key}
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, x: isDesktop ? 24 : 0, y: isDesktop ? 0 : 12 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: isDesktop ? -16 : 0 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                data-depth={depth}
              >
                {renderSpec(shown.spec)}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
