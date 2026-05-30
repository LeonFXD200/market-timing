# Market Timing

A dependency-free browser app for estimating Facebook Marketplace time-to-sale from your own listing history.

## Features

- Add Marketplace listing links and track sold, active, or removed items.
- Calculate observed average listing time before sale.
- Estimate likely unmarked sales using category sale history, listing age, and price competitiveness.
- Calculate an adjusted average that includes likely sales.
- Import and export CSV data.
- Share the analyzer URL using the browser share sheet or clipboard.
- Store all listing data locally in the browser.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static server:

```powershell
python -m http.server 4173
```

Then visit `http://localhost:4173`.

## Data and API policy

This project does not use Facebook scraping, paid APIs, or APIs requiring sign-up. Facebook pages can be login-gated and their historical sold state is not reliably available from a shared URL alone. The app therefore uses data that the user enters or imports, and makes its inferred-sale calculation transparent.

## Prediction method

For an active listing, the app calculates a sale likelihood from:

- age relative to the average confirmed sale time in the same category;
- price relative to the median sold price in the same category;
- the amount of confirmed-sale evidence available.

An active item is treated as likely sold when its confidence reaches 72%, its age is at least 1.25 times the category benchmark, and its price is no more than 10% above the category benchmark.

This is a practical heuristic, not proof that a listing sold.
