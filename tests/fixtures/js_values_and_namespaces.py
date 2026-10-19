# A JavaScript Set's items, and JavaScript's null and undefined as a hash and
# as a subscript. Each answer is what CPython answers where it has one.
from browser import window
from javascript import NULL, UNDEFINED

__all__ = ["answers"]


# Each answer on its own, an error told by its class.
def safely(call):
    try:
        return call()
    except Exception as error:
        return type(error).__name__


def answers():
    values = window.Set.new([0.25, 0.5])

    return [
        safely(lambda: repr([f"{x:.2f}" for x in values])),
        safely(lambda: repr(len({None, NULL}))),
        safely(lambda: repr(hash(NULL) == hash(UNDEFINED))),
        safely(lambda: repr([1, 2][NULL])),
    ]
