import { useState } from 'react';

export function useViewedMonth(year: number, month: number) {
  const [viewedYear, setViewedYear] = useState(year);
  const [viewedMonth, setViewedMonth] = useState(month);

  return {
    month: viewedMonth,
    setMonth: setViewedMonth,
    setYear: setViewedYear,
    year: viewedYear,
  };
}
