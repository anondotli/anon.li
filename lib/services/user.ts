
import { prisma } from "@/lib/prisma"

export class UserService {

    static async updateProfile(userId: string, data: { name: string }) {
        await prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
            },
        })
    }
}
