import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { FinancialReport, FinancialSettlementAccountKey } from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

export type FinancialReportPdfInput = {
  report: FinancialReport;
  periodLabel: string;
  modeLabel: string;
  from: string;
  to: string;
  settlementAccount: FinancialSettlementAccountKey;
};

const BRAND = {
  primary: [13, 92, 99] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  soft: [240, 249, 249] as [number, number, number],
};

function settlementLabel(
  key: FinancialSettlementAccountKey,
  report: FinancialReport,
): string {
  if (key === "all") {
    return "All settlement accounts";
  }
  const match = report.settlementAccounts.find((account) => account.key === key);
  if (!match) {
    return key;
  }
  return `${match.label} · ${match.account}`;
}

function ensureSpace(doc: JsPdfWithAutoTable, y: number, needed = 40): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed < pageHeight - 18) {
    return y;
  }
  doc.addPage();
  return 20;
}

function drawSectionTitle(doc: JsPdfWithAutoTable, title: string, y: number) {
  const nextY = ensureSpace(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.primary);
  doc.text(title, 14, nextY);
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.4);
  doc.line(14, nextY + 2, 196, nextY + 2);
  return nextY + 8;
}

export function exportFinancialReportPdf(input: FinancialReportPdfInput) {
  const { report, periodLabel, modeLabel, from, to, settlementAccount } = input;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  }) as JsPdfWithAutoTable;

  const generatedAt = new Date().toLocaleString();

  // Header band
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Friends Bingo", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Financial Report", 14, 20);
  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt}`, 196, 12, { align: "right" });

  let y = 38;

  // Meta
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(9);
  doc.text(`Mode: ${modeLabel}`, 14, y);
  doc.text(`Period: ${periodLabel}`, 14, y + 5);
  doc.text(`Dates: ${from} → ${to}`, 14, y + 10);
  doc.text(
    `Deposit filter: ${settlementLabel(settlementAccount, report)}`,
    14,
    y + 15,
  );
  y += 24;

  // Wallet liability hero
  y = drawSectionTitle(doc, "Player wallet liability (current)", y);
  doc.setFillColor(...BRAND.soft);
  doc.roundedRect(14, y, 182, 22, 2, 2, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Available", 20, y + 8);
  doc.text("Locked", 78, y + 8);
  doc.text("Total liability", 136, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(formatCurrency(report.totalWalletsBalance), 20, y + 16);
  doc.text(formatCurrency(report.totalWalletsLocked), 78, y + 16);
  doc.setTextColor(...BRAND.primary);
  doc.text(formatCurrency(report.totalWalletsLiability), 136, y + 16);
  y += 30;

  // Period metrics
  y = drawSectionTitle(doc, "Period summary", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Amount"]],
    body: [
      ["Deposits total", formatCurrency(report.depositsTotal)],
      ["Withdrawals total", formatCurrency(report.withdrawalsTotal)],
      ["Company fee total", formatCurrency(report.companyFeeTotal)],
      ["Bonus entry value", formatCurrency(report.bonusEntryValueTotal)],
      ["Game entry total", formatCurrency(report.gameEntryTotal)],
      ["Prize paid total", formatCurrency(report.prizePaidTotal)],
      ["Expenses total", formatCurrency(report.expensesTotal)],
      ["Net revenue (money + bonus entries − prizes)", formatCurrency(report.netRevenue)],
      ["Profit net", formatCurrency(report.profitNet)],
      ["Transaction count", String(report.transactionCount)],
      ["Registered cartelas", String(report.registeredCartelasCount)],
      ["Bonus cartelas used", String(report.bonusCartelasUsed)],
    ],
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.4,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: BRAND.primary,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 92, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Settlement breakdown
  if (report.settlementBreakdown.length > 0) {
    y = drawSectionTitle(doc, "Deposits by settlement account", y);
    autoTable(doc, {
      startY: y,
      head: [["Account", "Number", "Deposits", "Count"]],
      body: report.settlementBreakdown.map((item) => [
        item.label,
        item.account,
        formatCurrency(item.depositsTotal),
        String(item.depositCount),
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: BRAND.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // Daily totals
  if (report.dailyTotals.length > 0) {
    y = drawSectionTitle(doc, "Daily totals", y);
    autoTable(doc, {
      startY: y,
      head: [
        [
          "Date",
          "Deposits",
          "Withdrawals",
          "Entries",
          "Prizes",
          "Fees",
          "Expenses",
          "Profit",
        ],
      ],
      body: report.dailyTotals.map((day) => [
        day.date,
        formatCurrency(day.depositsTotal),
        formatCurrency(day.withdrawalsTotal),
        formatCurrency(day.gameEntryTotal),
        formatCurrency(day.prizePaidTotal),
        formatCurrency(day.companyFeeTotal),
        formatCurrency(day.expensesTotal),
        formatCurrency(day.profitNet),
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: BRAND.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // Expenses
  y = drawSectionTitle(doc, "Expenses in period", y);
  if (report.expenses.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text("No expenses recorded for this period.", 14, y);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Reason", "Note", "Amount"]],
      body: report.expenses.map((expense) => [
        expense.expenseDate.slice(0, 10),
        expense.reason,
        expense.note || "—",
        formatCurrency(expense.amount),
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: BRAND.primary,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      "Friends Bingo Admin · Confidential financial report",
      14,
      287,
    );
    doc.text(`Page ${page} of ${pageCount}`, 196, 287, { align: "right" });
  }

  const safePeriod = periodLabel.replace(/[^\w\-]+/g, "_").slice(0, 40);
  doc.save(`friends-bingo-financial_${safePeriod}_${from}_${to}.pdf`);
}
