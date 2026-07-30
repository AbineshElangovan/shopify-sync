// Mocking the SKU generator format logic to prove it works
function generateSkuString(globalPrefix, productPrefix, collectionTitle, optionsStr, paddedSequence) {
  const words = collectionTitle.trim().split(/[\s\-]+/).filter(w => w.length > 0);
  let colPrefix = '';
  if (words.length === 1) {
    colPrefix = words[0].substring(0, 3).toUpperCase();
  } else if (words.length === 2) {
    colPrefix = (words[0][0] + words[1].substring(0, 2)).toUpperCase();
  } else if (words.length >= 3) {
    colPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  }
  colPrefix = (colPrefix || 'COL').padEnd(3, 'X').substring(0, 3);
  
  if (optionsStr) {
    return `${globalPrefix}-${productPrefix}-${colPrefix}-${optionsStr}-${paddedSequence}`;
  } else {
    return `${globalPrefix}-${productPrefix}-${colPrefix}-${paddedSequence}`;
  }
}

console.log("--- TESTING SKU GENERATOR LOGIC ---");
console.log("1 Word (PANTS):", generateSkuString('STB', 'HELLO', 'PANTS', '', '0017'));
console.log("2 Words (Mens Summer):", generateSkuString('STB', 'HELLO', 'Mens Summer', '', '0017'));
console.log("3 Words (MENS ACCESSORIES):", generateSkuString('STB', 'HELLO', 'MENS ACCESSORIES', '', '0017'));
console.log("3+ Words (New Mens Summer Accessories):", generateSkuString('STB', 'HELLO', 'New Mens Summer Accessories', 'L', '0017'));
