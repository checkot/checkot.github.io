# RENATA PLC — Overtime Report & Allowance Calculator (RPPF Production)

**Official Progressive Web Application (PWA) & Security Compliance Documentation**

## 1. Executive Summary

The **RENATA PLC Overtime Report & Allowance Calculator** is a client-side Progressive Web Application (PWA) engineered for employees and floor/production in-charges at the **Rajendrapur Potent Product Facility (RPPF)**. It enables instant lookup of monthly overtime hours, holiday allowances, night allowances, punch verification statuses, and section-level leaderboards using pre-indexed JSON summaries generated directly in the browser from monthly Excel workbooks.

| Attribute | Specification |
| :--- | :--- |
| **Application Architecture** | 100% Client-Side Static Progressive Web App (PWA) |
| **Data Processing Engine** | In-Browser Excel (`.xlsx`) to Pre-Indexed JSON (`data/YYYY-MM.json`) |
| **Hosting Infrastructure** | RPPF Cloud Server (HTTPS / TLS 1.3 Encrypted Static Hosting) |
| **External Telemetry / Tracking** | None (Zero Third-Party Analytics, Ads, or Data Mining SDKs) |
| **Document Version** | 3.0.0 (October 2026) |

## 2. Security & Data Privacy Compliance Notice

This application is designed in accordance with corporate IT governance and data minimization principles:

1. **Zero Server-Side Database Exposure**: All overtime calculations, rate package evaluations, and leaderboard aggregations execute locally inside the user's browser sandbox. No external backend server or third-party cloud database processes or stores raw employee inputs.
2. **Strict Local Privacy for Salary Inputs**: When an employee uses the optional Payslip Estimator, the entered monthly salary value is stored exclusively in the device's local browser storage (`localStorage`) under `renata_salary_v1`. It is never transmitted over the network.
3. **Pre-Indexed Data Minimization (`data/YYYY-MM.json`)**: Raw Excel workbooks uploaded by authorized administrators are parsed in-memory inside the browser using SheetJS (`xlsx.full.min.js`). Only structured attendance metrics (Duty Hours, OT Hours, Holiday Dates, Night Dates, and Missing Punch Dates) are committed to `data/YYYY-MM.json`.
4. **Role-Based Access & Credential Isolation**:
   - **Employee Mode**: Displays personal overtime metrics and comparisons for the registered Employee ID.
   - **Floor / Production In-Charge Mode**: Protected by an In-Charge PIN for section-wide punch monitoring and bulk ERP reporting. Executive/Above records (`Overall` area) are restricted strictly to In-Charge mode.
   - **Admin Control Panel**: Protected by administrator authentication and a locally stored `Server Access Key`. The access key never leaves the administrator's device except in direct HTTPS `Authorization` headers to the repository API.

## 3. Core Architecture & Features (v3.0 Master Update)

- **Excel-Only Fast Engine**: Eliminates legacy PDF rendering (`pdf.js`, `pdf-lib`) and OCR (`tesseract.js`) overhead, reducing bundle load size and delivering sub-0.1s report lookups.
- **Rate-Centric Package Control**: Administrators manage rate buckets (`৳38/hr Contractual`, `৳40/hr JO C–F`, `৳45/hr JO A/B`, `Unspecified`, or custom rate packages) and update hourly OT rates, night allowances, and holiday formulas in one click.
- **Multi-Mode Leaderboard**: Supports **Monthly Ranking**, **Last 3 / 6 Months**, and **All-Time Best (2026)** views with both cumulative totals and monthly averages (`Avg Duty`, `Avg OT`, `Avg Night`).
- **Smart ERP Support Routing**: Routes individual punch inquiries and In-Charge bulk section punch summaries directly to the designated area ERP representative via WhatsApp.
- **Bilingual Interface (`BN | EN`)**: Instant dictionary-based switching between Bengali and English across headers and core report views.
