import { BookingWorkspace } from '@/components/booking-workspace';
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingWorkspace key={id} mode="edit" bookingId={id}/>;
}
