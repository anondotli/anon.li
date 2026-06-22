import "server-only";

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { FormService } from "@/lib/services/form";
import { createLogger } from "@/lib/logger";
import { loadOgFonts } from "./fonts";
import {
  DROP_OG_CONTENT,
  FORM_FALLBACK_OG_CONTENT,
  OG_CONTENT_TYPE,
  OG_SIZE,
  formOgContent,
  type OgCardContent,
} from "./content";

const logger = createLogger("og");

// Hardcoded brand hex values — Satori cannot read the CSS-variable theme.
const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a1a1aa";

// The anon.li mark, recolored onto a rounded white tile so it reads on the dark
// background. Path is copied from public/white-square.svg (viewBox 0 0 100 100).
const ANON_MARK_PATH =
  "M 48.514153,89.833331 C 36.62672,85.649719 23.504203,72.089386 17.688427,57.97842 c -1.475855,-3.58011 -1.498018,-3.824504 -0.2176,-2.409018 1.502047,1.660876 2.745191,2.781095 3.937963,3.546196 0.805928,0.516716 1.361012,1.233935 2.23242,2.880846 5.127716,9.689942 13.145689,17.622248 23.324555,23.071718 3.112897,1.665863 3.166288,1.664867 6.61868,-0.236413 10.293712,-5.668926 18.22404,-13.623176 23.084792,-23.1595 0.57523,-1.129197 1.20184,-1.881328 2.120597,-2.549669 0.717275,-0.520707 2.157871,-1.837439 3.201548,-2.925737 3.87752,-4.040967 -2.112537,8.572716 -7.340993,15.461612 -7.528372,9.917378 -21.665352,19.74797 -26.136236,18.174876 M 27.925723,58.983924 C 18.385555,56.43226 12.911291,46.302409 12.545601,30.5176 12.287704,19.404192 12.603017,19.092964 28.065754,15.148757 c 5.718057,-1.45838 13.001628,-3.318762 16.18605,-4.133738 5.791597,-1.4823205 5.791597,-1.4823205 15.326729,0.947647 5.244575,1.336682 12.353864,3.143197 15.799205,4.014036 11.568084,2.925735 12.131226,3.573129 12.122159,13.943382 -0.01611,19.005812 -7.694593,29.974579 -20.651895,29.499758 -16.74617,-0.614476 -18.528279,-24.429347 -2.07728,-27.763071 5.480308,-1.111241 12.193686,0.510731 11.978101,2.892818 -0.73138,8.086921 -9.532111,13.465567 -17.564187,10.733352 -4.820456,-1.639929 -1.515144,7.267955 3.568245,9.617122 C 73.5372,59.882692 82.715709,50.156838 83.92863,32.459778 84.65598,21.843136 84.913878,22.106483 70.179505,18.407664 A 3813.0453,3775.626 0 0 1 55.023026,14.573186 c -5.026972,-1.290795 -5.026972,-1.290795 -6.929969,-0.770089 -1.045692,0.287287 -7.359128,1.899286 -14.030194,3.584102 -16.045012,4.05194 -15.468774,3.874382 -16.615205,5.130264 -3.145134,3.44744 -1.080952,19.943484 3.342583,26.721654 6.19557,9.489441 19.332191,8.876962 21.937352,-1.023458 0.898609,-3.418513 0.678993,-3.776623 -1.80125,-2.929725 -7.724815,2.637451 -15.467765,-1.743671 -17.372777,-9.829597 -0.969127,-4.112789 8.959902,-5.762692 15.51713,-2.579595 15.675293,7.611103 5.838946,30.647908 -11.144973,26.107182 M 40.145602,41.767668 c 5.977969,-1.965121 -4.734825,-8.155752 -11.379699,-6.576671 -1.601781,0.381053 -1.541336,0.205489 -0.67295,1.930206 2.362375,4.691354 6.759718,6.387143 12.053657,4.646465 m 27.155732,0.03292 c 2.266672,-0.992534 4.619981,-3.550186 5.260693,-5.715807 0.441246,-1.488306 -6.205642,-1.572099 -9.342716,-0.118707 -2.70288,1.251893 -5.168012,3.553178 -5.168012,4.823026 0,1.346657 6.789941,2.089811 9.250035,1.011488";

function BrandRow() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <svg width={56} height={56} viewBox="0 0 100 100">
        <path fill="#ffffff" d={ANON_MARK_PATH} />
      </svg>
      <span style={{ marginLeft: 20, fontSize: 32, fontWeight: 600 }}>anon.li</span>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke={MUTED}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function OgCard({ content }: { content: OgCardContent }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        backgroundColor: BG,
        color: FG,
        padding: 80,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: 56 }}>
        {content.showBranding ? <BrandRow /> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Playfair Display",
            fontWeight: 500,
            fontSize: 60,
            lineHeight: 1.1,
            letterSpacing: -1,
          }}
        >
          {content.title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 30,
            color: MUTED,
            lineHeight: 1.3,
          }}
        >
          {content.subtitle}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", color: MUTED, fontSize: 26 }}>
        <LockGlyph />
        <span style={{ marginLeft: 14 }}>{content.footer}</span>
      </div>
    </div>
  );
}

// Drop images never change → cache hard. Form images can change when the owner
// edits the title, so use a shorter shared-cache window.
const DROP_CACHE_CONTROL = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
const FORM_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

/** Last-resort response: the existing static OG image, so a crawler never 500s. */
async function staticImageFallback(cacheControl: string): Promise<Response> {
  const buf = await readFile(join(process.cwd(), "public", "og-image.png"));
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": OG_CONTENT_TYPE, "cache-control": cacheControl },
  });
}

async function renderCard(content: OgCardContent, cacheControl: string): Promise<Response> {
  try {
    const fonts = await loadOgFonts();
    return new ImageResponse(<OgCard content={content} />, {
      ...OG_SIZE,
      fonts,
      headers: { "cache-control": cacheControl },
    });
  } catch (error) {
    logger.error("Failed to render OG image", error);
    return staticImageFallback(cacheControl);
  }
}

/** Generic branded image for any Drop (zero-knowledge — no per-drop data). */
export function renderDropOgImage(): Promise<Response> {
  return renderCard(DROP_OG_CONTENT, DROP_CACHE_CONTROL);
}

/** Branded image for a public form, using its plaintext title/description. */
export async function renderFormOgImage(id: string): Promise<Response> {
  let content = FORM_FALLBACK_OG_CONTENT;
  try {
    const form = await FormService.getPublicForm(id);
    content = formOgContent(form);
  } catch {
    // Not found / taken down / any error → generic branded fallback (no leak).
  }
  return renderCard(content, FORM_CACHE_CONTROL);
}
