// The Widget (size M): the sets per Ring, the last Edition, the changes waiting, and a way to open the View.

import { connect } from "@tessello/sdk";
import { mount } from "svelte";
import "../lib/base.css";
import { setLocale } from "../lib/i18n.ts";
import { applyTheme } from "../lib/theme.ts";
import Widget from "./Widget.svelte";

const host = await connect();
setLocale(host.context.locale);
document.documentElement.lang = host.context.locale;
applyTheme(host.context.theme);
host.onThemeChange(applyTheme);

mount(Widget, { target: document.body, props: { host } });
