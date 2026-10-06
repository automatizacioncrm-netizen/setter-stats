export async function readCombinedPage<T>(
  sources: { totalRecords: number; rows: T[] }[],
  page: number,
  pageSize: number,
  readPage: (source: number, page: number) => Promise<T[]>,
) {
  const totalRecords = sources.reduce((sum, source) => sum + source.totalRecords, 0);
  const totalPages = Math.ceil(totalRecords / pageSize);
  const currentPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalRecords);
  let offset = 0;
  const slices = sources.map(async (source, index) => {
    const localStart = Math.max(0, start - offset);
    const localEnd = Math.min(source.totalRecords, end - offset);
    offset += source.totalRecords;
    if (localStart >= localEnd) return [];
    const firstPage = Math.floor(localStart / pageSize) + 1;
    const lastPage = Math.floor((localEnd - 1) / pageSize) + 1;
    const pages = await Promise.all(
      Array.from({ length: lastPage - firstPage + 1 }, (_, step) => {
        const number = firstPage + step;
        return number === 1 ? source.rows : readPage(index, number);
      }),
    );
    const sliceStart = localStart - (firstPage - 1) * pageSize;
    return pages.flat().slice(sliceStart, sliceStart + localEnd - localStart);
  });
  return {
    rows: (await Promise.all(slices)).flat(),
    pagination: { page: currentPage, pageSize, totalRecords, totalPages },
  };
}
