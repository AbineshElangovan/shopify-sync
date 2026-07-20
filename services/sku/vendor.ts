import { prisma } from "@/lib/db/prisma";

export async function getVendorCode(vendor: string | null | undefined): Promise<string> {
  const normalizedVendor = (vendor || "").trim();
  if (!normalizedVendor) {
    return "GEN";
  }

  // Check if mapping exists
  const existing = await prisma.vendorCode.findUnique({
    where: { vendorName: normalizedVendor },
  });

  if (existing) {
    return existing.code;
  }

  // Generate code logic
  let baseCode = normalizedVendor
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);

  // If the vendor is less than 2 letters, pad with X
  if (baseCode.length === 1) baseCode += "X";
  if (baseCode.length === 0) baseCode = "GN";

  let code = baseCode;
  let attempts = 0;

  while (true) {
    try {
      // Try to insert
      const newVendorCode = await prisma.vendorCode.create({
        data: {
          vendorName: normalizedVendor,
          code,
        },
      });
      return newVendorCode.code;
    } catch (err: any) {
      // Prisma unique constraint violation code is P2002
      if (err.code === "P2002") {
        attempts++;
        if (attempts > 99) {
          code = `V${Date.now() % 1000}`; // fallback
        } else {
          // Generate an alternative code
          code = `${baseCode[0]}${attempts}`;
        }
      } else {
        throw err;
      }
    }
  }
}
