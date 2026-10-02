// On-demand loaders for the heavy export libraries (xlsx ≈ 430 KB, jsPDF +
// autotable ≈ 420 KB). Pages call these from export handlers so the libraries
// are fetched on the first export click instead of blocking the page's chunk.
export const loadXlsx = () => import('xlsx');

export async function loadPdf() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
}
