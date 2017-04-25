import { exec } from 'child_process';
import * as pify from 'pify';

export interface DiskInfo {
    path: string;
    size: number;
    free: number;
    isRemovable: boolean;
    isFixed?: boolean;
    isNetwork?: boolean;
    isOptical?: boolean;
}

/**
 * Enumerate all removable disks attached to the running system
 * 
 * @param minimumSize Minimum size in bytes
 * @param maximumSize Maximum size in bytes
 */
export function enumerateRemovableDisks(minimumSize: number = 0, maximumSize: number = 0): Promise<DiskInfo[]> {
    return ((process.platform == "win32") ? enumerateDisksWin32() : enumerateDisksUnix()).then((disks) => {
        let result: string[] = [];
        return disks.filter((disk) => {
            if (disk.size >= minimumSize) {
                if (maximumSize === 0 || disk.size <= maximumSize) {
                    return true;
                }
            }
            return false;
        });
    });
}

/**
 * Disk enumerator for win32 environment
 */
function enumerateDisksWin32(): Promise<DiskInfo[]> {
    return pify(exec)("wmic logicaldisks get Caption,DriveType,FreeSpace,Size").then((stdout: string) => {
        let result: DiskInfo[] = [];
        stdout.split("\r\r\n").forEach((line) => {
            let col = line.split(/\s+/);
            if (col[0].match(/^[A-Z]:$/)) {
                result.push({
                    path: col[0],
                    size: parseInt(col[3]),
                    free: parseInt(col[2]),
                    isRemovable: (col[1] === "2"),
                    isFixed:     (col[1] === "3"),
                    isNetwork:   (col[1] === "4"),
                    isOptical:   (col[1] === "5"),
                });
            }
        });
        return result;
    });
}

/**
 * Disk enumerator for UNIX(mac/Linux) environment
 */
function enumerateDisksUnix(): Promise<DiskInfo[]> {
    return pify(exec)("df -k -P").then((stdout: string) => {
        let result: DiskInfo[] = [];
        stdout.split("\n").forEach((line) => {
            let col = line.split(/\s+/);
            if (col[0].match(/^\//)) {
                result.push({
                    path: col[5],
                    size: parseInt(col[1]) * 1024,
                    free: parseInt(col[3]) * 1024,
                    isRemovable: (!!col[5].match(/^\/(Volumes|media|run\/media)/)),
                });
            }
        });
        return result;
    });
}
