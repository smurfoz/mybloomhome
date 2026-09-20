import { PageHeader, Card } from '@/components/ui';
import { CompanyForm } from '../company-form';
import { createCompany } from '../actions';

export default function NewCompanyPage() {
  return (
    <div>
      <PageHeader title="New Company" description="Add a general contractor, subcontractor, developer, or owner." />
      <Card className="max-w-2xl p-6">
        <CompanyForm action={createCompany} cancelHref="/companies" />
      </Card>
    </div>
  );
}
