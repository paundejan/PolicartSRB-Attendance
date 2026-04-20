const ExcelJS = require('exceljs');
const path = require('path');

async function check() {
    const p = path.join(__dirname, '..', 'Prisutnost na poslu 2026.xlsx');
    console.log('Loading:', p);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(p);
    
    console.log("SHEETS:");
    workbook.eachSheet((s) => console.log(s.id, s.name));
    
    const s1 = workbook.worksheets[0];
    console.log(`\nReading Sheet: ${s1.name}`);
    
    for (let r=1; r<=15; r++) {
        const row = s1.getRow(r);
        const rowVals = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber > 40) return; // limit to typical day columns
            let vl = cell.value;
            if (vl && typeof vl === 'object') {
              if (vl.result !== undefined) vl = `[FORMULA=${vl.result}]`;
              else if (vl.richText) vl = vl.richText.map(t=>t.text).join('');
              else vl = JSON.stringify(vl);
            }
            rowVals.push(vl);
        });
        if (rowVals.length) console.log(`Row ${r}:`, rowVals);
    }
}

check().catch(console.error);
