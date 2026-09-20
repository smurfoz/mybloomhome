import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { ContactForm } from '../../contact-form';
import { updateContact } from '../../actions';

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id: id } });
  if (!contact) notFound();

  const action = updateContact.bind(null, contact.id);

  return (
    <div>
      <PageHeader title={`Edit ${contact.firstName} ${contact.lastName}`} />
      <Card className="max-w-2xl p-6">
        <ContactForm action={action} contact={contact} cancelHref="/contacts" />
      </Card>
    </div>
  );
}
