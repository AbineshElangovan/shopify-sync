import { prisma } from "@/lib/db/prisma";

export async function getNextSequence(vendorCode: string): Promise<number> {
  // Find the vendor code entry
  const vendorEntry = await prisma.vendorCode.findUnique({
    where: { code: vendorCode }
  });

  if (!vendorEntry) {
    throw new Error(`Failed to find vendor code entry for code: ${vendorCode}`);
  }

  // Atomically increment the sequence and return the updated row
  const updatedSeq = await prisma.vendorCode.update({
    where: { id: vendorEntry.id },
    data: { nextSequence: { increment: 1 } }
  });

  // Since we incremented it to the 'next' value, the value we want to use is the one before it.
  return updatedSeq.nextSequence - 1;
}
