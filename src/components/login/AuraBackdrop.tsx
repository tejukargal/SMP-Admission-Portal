/** Full-screen petal-aura "scene" behind the sign-in cards: the lavender → blush
 *  wash plus three slowly drifting glows (`login-drift` in index.css). Render it as
 *  the first child of a `fixed inset-0` page root. */
export function AuraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ background: 'linear-gradient(150deg, #EEF0FF 0%, #F3EDFF 55%, #FBEEFB 100%)' }}
    >
      <div className="login-drift absolute -top-24 -left-24 w-[30rem] h-[30rem] rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 68%)' }} />
      <div className="login-drift absolute -bottom-28 -right-20 w-[32rem] h-[32rem] rounded-full" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.18), transparent 68%)', animationDelay: '-7s' }} />
      <div className="login-drift absolute top-1/3 right-[12%] w-[24rem] h-[24rem] rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.14), transparent 70%)', animationDelay: '-3.5s' }} />
    </div>
  );
}
