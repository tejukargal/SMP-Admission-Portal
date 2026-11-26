/** Compact copyright line pinned to the bottom centre of the sign-in pages.
 *  Sits in the page container's bottom padding, so it never overlaps the card. */
export function LoginFooter() {
  return (
    <p className="absolute inset-x-0 bottom-3 px-4 text-center text-[11px] text-[#8A8FA8] select-none">
      © {new Date().getFullYear()} SMP Admissions · SMP · All rights reserved.
    </p>
  );
}
