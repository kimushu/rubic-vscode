import { RubicBoard, BoardClass } from './rubicBoard'

const CLASS_NAMES = [
    "PeridotClassicBoard",
    "PeridotPiccoloBoard",
    "WakayamaRbBoard",
    "GrCitrusBoard",
];

let constructors: BoardClass[];

export class BoardClassList {
    static get classes(): BoardClass[] {
        if (!constructors) {
            constructors = CLASS_NAMES.map((name) => {
                return require(
                    `./${name.replace(/^[A-Z]/, s => s.toLowerCase())}`
                )[name];
            });
        }
        return constructors;
    }

    static getClass(boardClass: string): BoardClass {
        return this.classes.find((_class) => {
            return (_class.name === boardClass);
        });
    }
}
