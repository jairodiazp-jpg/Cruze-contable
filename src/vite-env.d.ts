/// <reference types="vite/client" />

declare module "*.ps1?raw" {
	const content: string;
	export default content;
}

declare module "*.sh?raw" {
	const content: string;
	export default content;
}
