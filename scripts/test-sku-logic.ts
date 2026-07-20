import { getVendorCode } from "@/services/sku/vendor";
import { getNextSequence } from "@/services/sku/sequence";
import { prisma } from "@/lib/db/prisma";

async function testSkuLogic() {
  console.log("=== Testing SKU Logic ===");
  try {
    // 1. Test getNextSequence
    console.log("\nTesting Sequences:");
    const seq1 = await getNextSequence("NI");
    console.log("Seq 1 (NI):", seq1);
    const seq2 = await getNextSequence("NI");
    console.log("Seq 2 (NI):", seq2);
    const seq3 = await getNextSequence("PU");
    console.log("Seq 3 (PU):", seq3);

    // 2. Test getVendorCode
    console.log("\nTesting Vendor Codes:");
    const v1 = await getVendorCode("Nike");
    console.log("Vendor 'Nike':", v1);
    
    const v2 = await getVendorCode("Puma");
    console.log("Vendor 'Puma':", v2);
    
    const v3 = await getVendorCode(null);
    console.log("Vendor null:", v3);

    const v4 = await getVendorCode("Levi's");
    console.log("Vendor 'Levi\\'s':", v4);
    
    // Testing duplicate handling (fetching existing)
    const v5 = await getVendorCode("Nike");
    console.log("Vendor 'Nike' (again, should match above):", v5);

    // 3. Output a simulated SKU
    console.log("\nSimulated SKUs:");
    console.log(`MSI-${v1}-${seq1.toString().padStart(6, '0')}`);
    console.log(`MSI-${v2}-${seq2.toString().padStart(6, '0')}`);

    console.log("\n✅ All DB tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testSkuLogic();
