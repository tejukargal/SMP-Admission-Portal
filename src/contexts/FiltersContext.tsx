import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';

const PAGE_SIZE = 100;

interface DashboardFilters {
  searchTerm: string;
  academicYearFilter: AcademicYear | '';
  courseFilter: Course | '';
  yearFilter: Year | '';
  genderFilter: Gender | '';
  categoryFilter: Category | '';
  admTypeFilter: AdmType | '';
  admCatFilter: AdmCat | '';
  admStatusFilter: string;
  visibleCount: number;
}

interface StudentsFilters {
  searchTerm: string;
  courseFilter: Course | '';
  yearFilter: Year | '';
  genderFilter: Gender | '';
  categoryFilter: Category | '';
  admTypeFilter: AdmType | '';
  admCatFilter: AdmCat | '';
  admStatusFilter: string;
  visibleCount: number;
}

interface FiltersContextValue {
  dashboardFilters: DashboardFilters;
  setDashboardFilters: (filters: Partial<DashboardFilters>) => void;
  clearDashboardFilters: () => void;
  studentsFilters: StudentsFilters;
  setStudentsFilters: (filters: Partial<StudentsFilters>) => void;
  clearStudentsFilters: () => void;
}

const defaultDashboard: DashboardFilters = {
  searchTerm: '',
  academicYearFilter: '',
  courseFilter: '',
  yearFilter: '',
  genderFilter: '',
  categoryFilter: '',
  admTypeFilter: '',
  admCatFilter: '',
  admStatusFilter: '',
  visibleCount: PAGE_SIZE,
};

const defaultStudents: StudentsFilters = {
  searchTerm: '',
  courseFilter: '',
  yearFilter: '',
  genderFilter: '',
  categoryFilter: '',
  admTypeFilter: '',
  admCatFilter: '',
  admStatusFilter: '',
  visibleCount: PAGE_SIZE,
};

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [dashboardFilters, setDashboard] = useState<DashboardFilters>(defaultDashboard);
  const [studentsFilters, setStudents] = useState<StudentsFilters>(defaultStudents);

  function setDashboardFilters(patch: Partial<DashboardFilters>) {
    setDashboard((prev) => ({ ...prev, ...patch }));
  }

  function clearDashboardFilters() {
    setDashboard(defaultDashboard);
  }

  function setStudentsFilters(patch: Partial<StudentsFilters>) {
    setStudents((prev) => ({ ...prev, ...patch }));
  }

  function clearStudentsFilters() {
    setStudents(defaultStudents);
  }

  return (
    <FiltersContext.Provider
      value={{
        dashboardFilters,
        setDashboardFilters,
        clearDashboardFilters,
        studentsFilters,
        setStudentsFilters,
        clearStudentsFilters,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
}
