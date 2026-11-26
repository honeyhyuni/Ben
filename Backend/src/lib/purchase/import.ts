import ExcelJS from "exceljs";
import { productInput, type ProductInput } from "./schemas";
import { AppError } from "@/lib/http";
export async function parseWorkbook(file: File): Promise<ProductInput[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 2 * 1024 * 1024 || !file.size)
    throw new AppError(400, "INVALID_WORKBOOK", "2MiB 이하 .xlsx 파일을 사용해 주세요.");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); }
  catch { throw new AppError(400, "INVALID_WORKBOOK", "엑셀 파일을 읽을 수 없습니다."); }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 101)
    throw new AppError(400, "IMPORT_LIMIT", "첫 시트에 헤더와 최대 100개 상품을 입력해 주세요.");
  const headers = ["market", "shopNumber", "productNumber", "unitPrice", "sizes", "colors", "moq", "leadTime", "memo"];
  if (headers.some((h, i) => sheet.getRow(1).getCell(i + 1).text.trim() !== h))
    throw new AppError(400, "INVALID_HEADERS", headers.join(", "));
  const rows: ProductInput[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (!row.hasValues) continue;
    const values = headers.map((_, i) => {
      const cell = row.getCell(i + 1);
      if (cell.type === ExcelJS.ValueType.Formula)
        throw new AppError(400, "INVALID_CELL", n + "행: 수식 대신 값을 입력해 주세요.");
      return cell.text.trim();
    });
    const [market, shopNumber, productNumber, unitPrice, sizes, colors, moq, leadTime, memo] = values;
    const parsed = productInput.safeParse({ market, shopNumber, productNumber, unitPrice,
      sizes: sizes.split("|").map(v => v.trim()), colors: colors.split("|").map(name => ({ name: name.trim() })),
      moq: moq ? Number(moq) : 1, leadTime: leadTime || null, memo: memo || null });
    if (!parsed.success) throw new AppError(400, "INVALID_IMPORT_ROW", n + "행: " + parsed.error.issues.map(i => i.path.join(".") + " " + i.message).join("; "));
    rows.push(parsed.data);
  }
  if (!rows.length) throw new AppError(400, "EMPTY_IMPORT", "등록할 상품이 없습니다.");
  return rows;
}
