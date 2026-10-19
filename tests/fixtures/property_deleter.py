# A property with a deleter and no setter, deleted twice and written, and one
# with neither, deleted: what each answers, as `python3` answers on this module.
__all__ = ["answers"]


class A:
    def __init__(self):
        self.log = []

    @property
    def x(self):
        return "I am x"

    @x.deleter
    def x(self):
        self.log.append("deleted")


class B:
    @property
    def x(self):
        return 1


def caught(call):
    try:
        call()
        return "no error"
    except AttributeError as error:
        return "AttributeError: " + str(error)


def answers():
    a = A()
    del a.x
    delattr(a, "x")

    return [repr(a.log), caught(lambda: setattr(a, "x", 1)), caught(lambda: delattr(B(), "x"))]


if __name__ == "__main__":
    print(answers())
