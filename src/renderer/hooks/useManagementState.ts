import { useState } from 'react';

import type { FinancialCategory } from '../../domain/category';
import type { FinancialItemCustomType } from '../../domain/financial-item-custom-type';
import type { ManagementSection } from '../components/ManagementDialog';

export function useManagementState() {
  const [notification, setNotification] = useState<string | null>(null);
  const [customTypes, setCustomTypes] = useState<
    readonly FinancialItemCustomType[]
  >([]);
  const [categories, setCategories] = useState<
    readonly FinancialCategory[]
  >([]);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [managementSection, setManagementSection] =
    useState<ManagementSection>('asset_type');
  const [managementError, setManagementError] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<'assets' | 'transactions'>(
    'assets',
  );
  const [typeManagementVersion, setTypeManagementVersion] = useState(0);

  return {
    activeView,
    categories,
    customTypes,
    isManagementOpen,
    managementError,
    managementSection,
    notification,
    setActiveView,
    setCategories,
    setCustomTypes,
    setIsManagementOpen,
    setManagementError,
    setManagementSection,
    setNotification,
    setTypeManagementVersion,
    typeManagementVersion,
  };
}
