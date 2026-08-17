const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

async function convertHtmlToPdf(inputFile, outputFile) {
    const inputPath = path.resolve(inputFile);
    const outputPath = path.resolve(outputFile);

    if (!fs.existsSync(inputPath)) {
        console.error(`HTML file not found: ${inputPath}`);
        process.exit(1);
    }

    console.log(`Input : ${inputPath}`);
    console.log(`Output: ${outputPath}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    });

    try {
        const page = await browser.newPage();

        // Your CV is around 1060px wide, so give Chromium
        // enough room to render it naturally.
        await page.setViewport({
            width: 1200,
            height: 1600,
            deviceScaleFactor: 1
        });

        const fileUrl = "file://" + inputPath.replace(/\\/g, "/");

        await page.goto(fileUrl, {
            waitUntil: "networkidle0",
            timeout: 60000
        });

        // Preserve the webpage appearance instead of @media print styles.
        await page.emulateMediaType("screen");

        // Wait until web fonts are fully loaded.
        await page.evaluate(async () => {
            if (document.fonts) {
                await document.fonts.ready;
            }
        });

        // Wait for all images to finish loading.
        await page.evaluate(async () => {
            const images = Array.from(document.images);

            await Promise.all(
                images.map(img => {
                    if (img.complete) {
                        return Promise.resolve();
                    }

                    return new Promise(resolve => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                })
            );
        });

        // Disable animations/transitions and force final visible state.
        await page.addStyleTag({
            content: `
                *,
                *::before,
                *::after {
                    animation: none !important;
                    -webkit-animation: none !important;
                    transition: none !important;
                }

                html,
                body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;

                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                .cv-wrapper {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: none !important;
                    -webkit-transform: none !important;
                    animation: none !important;

                    margin: 0 !important;
                }

                .skill-fill {
                    transform: scaleX(1) !important;
                    -webkit-transform: scaleX(1) !important;
                }

                .dot.on {
                    opacity: 1 !important;
                    transform: scale(1) !important;
                    -webkit-transform: scale(1) !important;
                }

                .caret {
                    display: none !important;
                }

                #downloadBtn {
                    display: none !important;
                }

                .what-card,
                .grant-card,
                .edu-card,
                .ach-item,
                .ref-card,
                .tl-item {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
            `
        });

        // Force any remaining browser animations into their final state.
        await page.evaluate(() => {
            document.getAnimations().forEach(animation => {
                try {
                    animation.finish();
                } catch (e) {
                    animation.cancel();
                }
            });

            window.scrollTo(0, 0);
        });

        // Let layout settle.
        await new Promise(resolve => setTimeout(resolve, 800));

        // Measure the CV itself, NOT A4 paper.
        const dimensions = await page.evaluate(() => {
            const cv = document.querySelector(".cv-wrapper");

            if (!cv) {
                throw new Error("Could not find .cv-wrapper");
            }

            const rect = cv.getBoundingClientRect();

            return {
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height)
            };
        });

        console.log(
            `CV dimensions: ${dimensions.width}px x ${dimensions.height}px`
        );

        // Optional preview image.
        await page.screenshot({
            path: "cv-preview.png",
            fullPage: true
        });

        console.log("Created cv-preview.png");

        // Generate PDF using the CV's real dimensions.
        await page.pdf({
            path: outputPath,

            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,

            printBackground: true,

            margin: {
                top: "0px",
                right: "0px",
                bottom: "0px",
                left: "0px"
            },

            scale: 1,

            displayHeaderFooter: false,

            preferCSSPageSize: false
        });

        console.log("\nPDF created successfully:");
        console.log(outputPath);

    } finally {
        await browser.close();
    }
}


// -----------------------------
// Command-line handling
// -----------------------------

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
    console.log(`
Usage:

    node html-to-pdf.js input.html output.pdf

Example:

    node html-to-pdf.js Mohammed_Abduljabbar_CV.html Mohammed_Abduljabbar_CV.pdf
`);
    process.exit(1);
}

const outputPdf =
    output ||
    input.replace(/\\.html?$/i, "") + ".pdf";

convertHtmlToPdf(input, outputPdf)
    .catch(error => {
        console.error("\nConversion failed:");
        console.error(error);
        process.exit(1);
    });