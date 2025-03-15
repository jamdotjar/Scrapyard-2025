import random

def guess_the_number():
    number_to_guess = random.randint(1, 100)
    attempts = 0
    print("Welcome to the Guess the Number Game!")
    print("I'm thinking of a number between 1 and 100.")

    while True:
        guess = input("Take a guess: ")
        attempts += 1 #= attempts + 1

        try:
            guess = int(guess)
        except ValueError:
            print("Please enter a valid number.")
            continue

        if guess < number_to_guess:
            print("Your guess is too low.")
        elif guess > number_to_guess:
            print("Your guess is too high.")
        else:
            print(f"Congratulations! You guessed the number in {attempts} attempts.")
            break

if __name__ == "__main__":
    guess_the_number()