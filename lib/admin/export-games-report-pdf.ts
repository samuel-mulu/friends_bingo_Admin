import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { GamesReport } from "@/lib/api/types";
import { formatCurrency } from "@/lib/formatters";

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

export type GamesReportPdfInput = {
  report: GamesReport;
  periodLabel: string;
  modeLabel: string;
  from: string;
  to: string;
};

const BRAND = {
  primary: [13, 92, 99] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  soft: [240, 249, 249] as [number, number, number],
};

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

export function exportGamesReportPdf(input: GamesReportPdfInput) {
  const { report, periodLabel, modeLabel, from, to } = input;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  }) as JsPdfWithAutoTable;

  const generatedAt = new Date().toLocaleString();

  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Friends Bingo", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Game Report", 14, 20);
  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt}`, 196, 12, { align: "right" });

  let y = 38;
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(9);
  doc.text(`Mode: ${modeLabel}`, 14, y);
  doc.text(`Period: ${periodLabel}`, 14, y + 5);
  doc.text(`Dates: ${from} → ${to}`, 14, y + 10);
  y += 20;

  doc.setFillColor(...BRAND.soft);
  doc.roundedRect(14, y, 182, 18, 2, 2, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  doc.text("Avg players / game", 20, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.primary);
  doc.text(report.averagePlayersPerGame.toFixed(2), 20, y + 14);
  y += 26;

  y = drawSectionTitle(doc, "Period summary", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Games created", String(report.gamesCreated)],
      ["Games finished", String(report.gamesFinished)],
      ["Total registrations", String(report.totalRegistrations)],
      ["Total entry fees", formatCurrency(report.totalEntryFees)],
      ["Bonus entry value", formatCurrency(report.bonusEntryValueTotal)],
      ["Bonus cartelas used", String(report.bonusCartelasUsed)],
      ["Total prize amount", formatCurrency(report.totalPrizeAmount)],
      ["Average players per game", report.averagePlayersPerGame.toFixed(2)],
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
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 92, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  y = drawSectionTitle(doc, "Winners", y);
  if (report.winners.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text("No winners recorded for this period.", 14, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Game", "Type", "Winner", "Phone", "Cartela", "Prize", "Finished"]],
      body: report.winners.map((winner) => [
        `${winner.gameName}\n${winner.gameCode}`,
        winner.gameType,
        winner.winnerUser?.fullName ?? "Unknown",
        winner.winnerUser?.phoneNumber ?? "—",
        String(winner.cartelaNumber ?? "—"),
        formatCurrency(winner.prizeAmount),
        winner.finishedAt ? winner.finishedAt.slice(0, 16).replace("T", " ") : "—",
      ]),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [30, 41, 59],
        valign: "top",
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
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text("Friends Bingo Admin · Confidential game report", 14, 287);
    doc.text(`Page ${page} of ${pageCount}`, 196, 287, { align: "right" });
  }

  const safePeriod = periodLabel.replace(/[^\w\-]+/g, "_").slice(0, 40);
  doc.save(`friends-bingo-games_${safePeriod}_${from}_${to}.pdf`);
}
