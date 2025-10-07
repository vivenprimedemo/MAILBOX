import constant from "../utils/constants.js";
import { getFormattedDateTime } from "../helpers/index.js";

const logger = {
    info: (msg, ...args) => console.log(`${getFormattedDateTime()} ${constant.colors.green}info${constant.colors.reset}: ${msg}`, ...args),
    warn: (msg, ...args) => console.log(`${getFormattedDateTime()} ${constant.colors.yellow}warn${constant.colors.reset}: ${msg}`, ...args),
    error: (msg, ...args) => console.log(`${getFormattedDateTime()} ${constant.colors.red}error${constant.colors.reset}: ${msg}`, ...args),
    log: (msg, ...args) => console.log(`${getFormattedDateTime()} ${constant.colors.blue}log${constant.colors.reset}: ${msg}`, ...args)
}

export default logger;