interface CatalogTemplateRoot {
    /** Path of extension */
    extensionPath: string;
    /** Command name for communication */
    commandEntry: string;
    /** Show preview items */
    showPreview: boolean;
    /** Disable "official" badge */
    unofficial: boolean;
    /** Localized texts */
    localized: {
        official: string;
        preview: string;
        obsolete: string;
        website: string;
        loading: string;
        changed: string;
        not_selected: string;
        no_item: string;
    };
    /** List of panels */
    panels: CatalogTemplatePanel[];
}

interface CatalogTemplatePanel {
    /** ID ot panel */
    id: string;
    /** Localized title */
    title: string;
    /** Whether the panel is opened */
    opened?: boolean;
    /** Whether the panel is disabled */
    disabled?: boolean;
    /** ID of saved selection */
    savedItemId?: string;
    /** ID of initial selection */
    initialItemId?: string;
    /** List of items */
    items?: CatalogTemplateItem[];
    /** List of pages */
    pages?: CatalogTemplatePage[];
}

interface CatalogTemplateItem {
    /** ID of item */
    id: string;
    /** Localized title (1st line) */
    title: string;
    /** Selected */
    selected?: boolean;
    /** Icon URL (relative path from extension folder) */
    icon?: string;
    /** Show "Official" badge */
    official?: boolean;
    /** Show "Preview" badge */
    preview?: boolean;
    /** Show "Obsolete" badge */
    obsolete?: boolean;
    /** Localized description (2nd line) */
    description?: string;
    /** Localized details (3rd line) */
    details?: string;
    /** Topics badge */
    topics?: CatalogTemplateTopic[];
    /** Menu items */
    menus?: CatalogTemplateMenu[];
}

interface CatalogTemplateTopic {
    /** Localized title */
    title: string;
    /** Color name */
    color: string;
    /** Tooltip text */
    tooltip?: string;
}

interface CatalogTemplateMenu {
    /** Localized title */
    title: string;
    /** Link address */
    url: string;
}

interface CatalogTemplatePage {
    /** Localized title */
    title: string;
    /** Is active */
    active?: boolean;
    /** Content */
    content: string;
}
